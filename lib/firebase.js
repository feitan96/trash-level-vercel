const admin = require("firebase-admin")

function initializeFirebase() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, "base64").toString("utf-8"))

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    })
  }

  return {
    db: admin.firestore(),
    realtimeDb: admin.database(),
  }
}

module.exports = { initializeFirebase }

