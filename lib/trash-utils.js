const admin = require("firebase-admin")

const calculateTrashLevel = (distance) => {
  const maxDistance = 100
  const minDistance = 2
  if (distance >= maxDistance) return 0
  if (distance <= minDistance) return 100
  return Math.round(((maxDistance - distance) / (maxDistance - minDistance)) * 100)
}

const fetchBins = async (realtimeDb) => {
  try {
    const binsRef = realtimeDb.ref("/")
    const snapshot = await binsRef.once("value")
    const binsData = snapshot.val()
    return binsData ? Object.keys(binsData) : []
  } catch (error) {
    console.error("Error fetching bins:", error)
    return []
  }
}

const fetchAndPostTrashLevel = async (db, realtimeDb) => {
  try {
    const bins = await fetchBins(realtimeDb)
    if (bins.length === 0) {
      return { success: false, message: "No bins found in Realtime DB." }
    }

    const results = []
    const timestamp = admin.firestore.FieldValue.serverTimestamp()

    for (const bin of bins) {
      const binRef = realtimeDb.ref(bin)
      const snapshot = await binRef.once("value")
      const binData = snapshot.val()

      if (binData && binData["distance(cm)"] !== null) {
        const distance = binData["distance(cm)"]
        const trashLevel = calculateTrashLevel(distance)

        await db.collection("trashLevels").add({
          bin,
          trashLevel,
          createdAt: timestamp,
        })

        results.push({ bin, trashLevel })
      } else {
        results.push({ bin, error: "No distance data found" })
      }
    }
    return { success: true, results, timestamp: new Date().toISOString() }
  } catch (error) {
    console.error("Error fetching or posting trash level:", error)
    return { success: false, error: error.message }
  }
}

module.exports = { calculateTrashLevel, fetchBins, fetchAndPostTrashLevel }

