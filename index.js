require("dotenv").config(); // Load environment variables from .env
const express = require("express"); // Import express
const admin = require("firebase-admin");
const twilio = require("twilio");
const { format, toZonedTime } = require("date-fns-tz"); // Import date-fns-tz functions

// Load the Firebase Service Account Key
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8")
);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL, // Add your Realtime Database URL
});

// Initialize Twilio Client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID, // Use environment variable
  process.env.TWILIO_AUTH_TOKEN   // Use environment variable
);

const db = admin.firestore();
const realtimeDb = admin.database();
const app = express(); // Initialize express
const port = process.env.PORT || 3000;

// Function to send SMS
const sendSms = async (to, message) => {
  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`SMS sent to ${to}: ${result.sid}`); // Log SMS sending
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error(`Error sending SMS to ${to}:`, error); // Log SMS error
    return { success: false, error: error.message };
  }
};

// Function to post a notification to Firestore
const postNotification = async (bin, trashLevel, gps) => {
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const notification = {
      trashLevel,
      datetime: timestamp,
      bin,
      isRead: false,
      gps: {
        latitude: gps.latitude,
        longitude: gps.longitude,
        altitude: gps.altitude
      }
    };

    await db.collection("newNotifications").add(notification);
    console.log(`Notification posted for ${bin}:`, notification); // Log notification posting
  } catch (error) {
    console.error("Error posting notification:", error); // Log notification error
  }
};

// Listen for changes in the Realtime Database
const listenToRealtimeDb = () => {
  const binsRef = realtimeDb.ref("/");

  binsRef.on("value", (snapshot) => {
    const binsData = snapshot.val();

    if (binsData) {
      Object.keys(binsData).forEach((bin) => {
        const binData = binsData[bin];
        const trashLevel = binData["trashLevel"]; // Use trashLevel directly from Firebase
        const gps = binData["gps"]; // Get GPS data from Firebase

        if (trashLevel !== null && trashLevel !== undefined) {
          console.log(`Bin: ${bin}, Trash Level: ${trashLevel}%`); // Log trash level

          // Send SMS and post notification if trash level is critical
          if ([90, 95, 100].includes(trashLevel)) {
            db.collection("users").get().then((usersSnapshot) => {
              usersSnapshot.forEach((userDoc) => {
                const userData = userDoc.data();
                const { contactNumber, firstName } = userData;

                if (contactNumber) {
                  const message = `🚨 Alert: Hi ${firstName}, Bin ${bin} is ${trashLevel}% full! Location: ${gps.latitude}, ${gps.longitude}. Please take action.`;
                  sendSms(contactNumber, message); // Send SMS
                }
              });
            });

            // Post a notification to Firestore with GPS data
            postNotification(bin, trashLevel, gps);
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