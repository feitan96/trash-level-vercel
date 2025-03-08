const admin = require("firebase-admin");

const fetchBins = async (realtimeDb) => {
  try {
    const binsRef = realtimeDb.ref("/");
    const snapshot = await binsRef.once("value");
    const binsData = snapshot.val();
    return binsData ? Object.keys(binsData) : [];
  } catch (error) {
    console.error("Error fetching bins:", error);
    return [];
  }
};

const fetchAndPostTrashLevel = async (db, realtimeDb) => {
  try {
    const bins = await fetchBins(realtimeDb);
    if (bins.length === 0) {
      return { success: false, message: "No bins found in Realtime DB." };
    }

    const results = [];
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const bin of bins) {
      const binRef = realtimeDb.ref(bin);
      const snapshot = await binRef.once("value");
      const binData = snapshot.val();

      if (binData && binData["trashLevel"] !== null && binData["trashLevel"] !== undefined) {
        const trashLevel = binData["trashLevel"];

        await db.collection("trashLevels").add({
          bin,
          trashLevel,
          createdAt: timestamp,
        });

        results.push({ bin, trashLevel });
      } else {
        results.push({ bin, error: "No trashLevel data found" });
      }
    }
    return { success: true, results, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error("Error fetching or posting trash level:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { fetchBins, fetchAndPostTrashLevel };