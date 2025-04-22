require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const { Vonage } = require('@vonage/server-sdk');

// Load the Firebase Service Account Key
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8")
);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const realtimeDb = admin.database();
const app = express();
const port = process.env.PORT || 3000;

// Update Vonage initialization
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
}, {
  appendToUserAgent: 'seagbin-app'
});

// Update the sendSms function
// const sendSms = async (to, message) => {
//   try {
//     const from = "SeaGBin";
//     const response = await vonage.sms.send({
//       to,
//       from,
//       text: message
//     });

//     const responseData = response.messages[0];
    
//     if (responseData.status === '0') {
//       console.log(`SMS sent to ${to}: ${responseData['message-id']}`);
//       return { success: true, id: responseData['message-id'] };
//     } else {
//       console.error(`Failed to send SMS to ${to}: ${responseData.error-text}`);
//       return { success: false, error: responseData['error-text'] };
//     }
//   } catch (error) {
//     console.error(`Error sending SMS to ${to}:`, error);
//     return { success: false, error: error.message };
//   }
// };

// Function to post a notification to Firestore
const postNotification = async (bin, trashLevel, gps, recipients) => {
    try {
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
  
      // Add isRead status to each recipient
      const recipientsWithReadStatus = recipients.map(recipient => ({
        ...recipient,
        isRead: false
      }));
  
      const notification = {
        trashLevel,
        datetime: timestamp,
        bin,
        recipients: recipientsWithReadStatus,
        gps: {
          latitude: gps.latitude,
          longitude: gps.longitude,
          altitude: gps.altitude
        }
      };
  
      await db.collection("newNotifications").add(notification);
      console.log(`Notification posted for ${bin}:`, notification);
    } catch (error) {
      console.error("Error posting notification:", error);
    }
  };

// Function to get notification recipients for a bin
const getNotificationRecipients = async (bin) => {
  try {
    // Get all admin users
    const adminUsersSnapshot = await db.collection("users")
      .where("role", "==", "admin")
      .get();

    // Get assigned users from binAssignments
    const binAssignmentSnapshot = await db.collection("binAssignments")
      .where("bin", "==", bin)
      .get();

    const recipients = [];

    // Add admin users
    for (const adminDoc of adminUsersSnapshot.docs) {
      const adminData = adminDoc.data();
      recipients.push({
        userId: adminDoc.id,
        firstName: adminData.firstName,
        lastName: adminData.lastName,
        contactNumber: adminData.contactNumber,
        role: 'admin'
      });
    }

    // Add assigned users if exists
    if (!binAssignmentSnapshot.empty) {
      const assignment = binAssignmentSnapshot.docs[0].data();
      // Check if assignee is an array and not empty
      if (Array.isArray(assignment.assignee) && assignment.assignee.length > 0) {
        // Fetch all assigned users in parallel
        const userPromises = assignment.assignee.map(userId => 
          db.collection("users").doc(userId).get()
        );
        const userDocs = await Promise.all(userPromises);

        // Add each valid user to recipients
        for (const userDoc of userDocs) {
          if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.role === 'user') {
              recipients.push({
                userId: userDoc.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                contactNumber: userData.contactNumber,
                role: 'user'
              });
            }
          }
        }
      } else {
        console.log(`No valid assignees found for bin: ${bin}`);
      }
    } else {
      console.log(`No assignment found for bin: ${bin}`);
    }

    return recipients;
  } catch (error) {
    console.error("Error getting notification recipients:", error);
    return [];
  }
};

// Listen for changes in the Realtime Database
const listenToRealtimeDb = () => {
  const binsRef = realtimeDb.ref("/");

  binsRef.on("value", async (snapshot) => {
    const binsData = snapshot.val();

    if (binsData) {
      Object.keys(binsData).forEach(async (bin) => {
        const binData = binsData[bin];
        const trashLevel = binData["trashLevel"];
        const gps = binData["gps"];

        if (trashLevel !== null && trashLevel !== undefined) {
          console.log(`Bin: ${bin}, Trash Level: ${trashLevel}%`);

          if ([90, 95, 100].includes(trashLevel)) {
            // Get all recipients for this bin
            const recipients = await getNotificationRecipients(bin);

            // Send SMS only to non-admin recipients (assigned users)
            // for (const recipient of recipients) {
            //   if (recipient.contactNumber && recipient.role === 'user') {
            //     const message = `Alert: Hi ${recipient.firstName}, Bin ${bin} is ${trashLevel}% full! Location: ${gps.latitude}, ${gps.longitude}. Please take action.`;
            //     sendSms(recipient.contactNumber, message);
            //   }
            // }

            // Post a notification to Firestore with GPS data and all recipients
            postNotification(bin, trashLevel, gps, recipients);
          }
        }
      });
    }
  });
};

// Start listening to the Realtime Database
listenToRealtimeDb();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});