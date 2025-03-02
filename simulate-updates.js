const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8")
  );
  

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const realtimeDb = admin.database();

const bin = "Quiboloy"; // Replace with your bin name
const distances = [14, 15, 16]; // Simulate 3 readings within 3 seconds

distances.forEach((distance, index) => {
  setTimeout(() => {
    realtimeDb.ref(bin).update({ "distance(cm)": distance })
      .then(() => console.log(`Updated ${bin} distance to ${distance}cm`))
      .catch((error) => console.error("Error updating distance:", error));
  }, index * 1000); // Update every second
});