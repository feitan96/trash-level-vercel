const { initializeFirebase } = require("./lib/firebase")
const { fetchAndPostTrashLevel } = require("./lib/trash-utils")

module.exports = async (req, res) => {
  console.log("Trigger started at:", new Date().toISOString())

  try {
    const { db, realtimeDb } = initializeFirebase()
    const result = await fetchAndPostTrashLevel(db, realtimeDb)

    console.log("Trash level update summary:", result)

    return res.status(result.success ? 200 : 500).json(result)
  } catch (error) {
    console.error("Error in trigger:", error)
    return res.status(500).json({ error: error.message })
  }
}

