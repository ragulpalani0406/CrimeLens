import mongoose from "mongoose";

const uri = "mongodb://ragulpalani0406_db_user:Loves0406@ac-rlymcm4-shard-00-00.wcelpnn.mongodb.net:27017,ac-rlymcm4-shard-00-01.wcelpnn.mongodb.net:27017,ac-rlymcm4-shard-00-02.wcelpnn.mongodb.net:27017/?ssl=true&replicaSet=atlas-j5ggqk-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0";

async function testConnection() {
  console.log("Connecting directly...");
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("SUCCESS");
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error.message);
    process.exit(1);
  }
}

testConnection();
