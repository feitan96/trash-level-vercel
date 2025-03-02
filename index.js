require("dotenv").config(); // Load environment variables from .env
const express = require("express"); // Import express
const admin = require("firebase-admin");
const twilio = require("twilio");

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

// Track distance readings for validation
const distanceReadings = {};

// Function to calculate trash level percentage
const calculateTrashLevel = (distance) => {
  const maxDistance = 100; // 100cm = 0% (empty)
  const minDistance = 2; // 0cm = 100% (full)

  if (distance >= maxDistance) return 0; // Bin is empty
  if (distance <= minDistance) return 100; // Bin is full

  // Linear interpolation to calculate percentage
  return Math.round(((maxDistance - distance) / (maxDistance - minDistance)) * 100);
};

// Function to validate distance readings
const validateDistance = (bin, distance) => {
  if (!distanceReadings[bin]) {
    distanceReadings[bin] = [];
  }

  // Add the new reading
  distanceReadings[bin].push({ distance, timestamp: Date.now() });

  // Remove readings older than 3 seconds
  distanceReadings[bin] = distanceReadings[bin].filter(
    (reading) => Date.now() - reading.timestamp <= 3000
  );

  // Log the current readings for the bin
  console.log(`Bin: ${bin}, Readings:`, distanceReadings[bin]);

  // Check if there are at least 3 readings
  if (distanceReadings[bin].length >= 2) {
    const readings = distanceReadings[bin].map((reading) => reading.distance);
    const min = Math.min(...readings);
    const max = Math.max(...readings);

    // Check if the deviation is within 5cm
    if (max - min <= 5) {
      // Return the latest reading
      return distanceReadings[bin][distanceReadings[bin].length - 1].distance;
    }
  }

  return null; // Invalid reading
};

// Function to send SMS
const sendSms = async (to, message) => {
  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`SMS sent to ${to}: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error(`Error sending SMS to ${to}:`, error);
    return { success: false, error: error.message };
  }
};

// Listen for changes in the Realtime Database
const listenToRealtimeDb = () => {
  const binsRef = realtimeDb.ref("/");

  binsRef.on("value", (snapshot) => {
    const binsData = snapshot.val();

    if (binsData) {
      console.log("Bins data updated:", binsData);

      Object.keys(binsData).forEach((bin) => {
        const binData = binsData[bin];
        const distance = binData["distance(cm)"];

        if (distance !== null) {
          console.log(`Bin: ${bin}, Distance: ${distance}cm`);

          // Validate the distance reading
          const validatedDistance = validateDistance(bin, distance);

          if (validatedDistance !== null) {
            console.log(`Bin: ${bin}, Validated Distance: ${validatedDistance}cm`);

            // Calculate the trash level
            const trashLevel = calculateTrashLevel(validatedDistance);
            console.log(`Bin: ${bin}, Validated Trash Level: ${trashLevel}%`);

            // Send SMS if trash level is critical
            if ([90, 95, 100].includes(trashLevel)) {
              db.collection("users").get().then((usersSnapshot) => {
                usersSnapshot.forEach((userDoc) => {
                  const userData = userDoc.data();
                  const { contactNumber, firstName } = userData;

                  if (contactNumber) {
                    const message = `🚨 Alert: Hi ${firstName}, Bin ${bin} is ${trashLevel}% full! Please take action.`;
                    sendSms(contactNumber, message);
                  }
                });
              });
            }
          } else {
            console.log(`Bin: ${bin}, Distance reading is not stable.`);
          }
        } else {
          console.log(`Bin: ${bin}, No distance data found.`);
        }
      });
    } else {
      console.log("No bins found in Realtime DB.");
    }
  });
};

// Start listening to the Realtime Database
listenToRealtimeDb();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});