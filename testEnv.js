
import dotenv from "dotenv";
dotenv.config();

console.log("PORT:", process.env.PORT);
console.log("SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("TOKEN:", process.env.TWILIO_AUTH_TOKEN);
console.log("FROM:", process.env.TWILIO_PHONE_NUMBER);
