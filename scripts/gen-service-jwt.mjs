// Generate a PostgREST service_role JWT that matches your PGRST_JWT_SECRET.
// Usage:
//   node scripts/gen-service-jwt.mjs "<your-jwt-secret>"
// Put the output into SUPABASE_SERVICE_KEY in your .env.
import crypto from "node:crypto";

const secret = process.argv[2] || process.env.PGRST_JWT_SECRET;
if (!secret) {
  console.error("Pass the JWT secret as an argument or set PGRST_JWT_SECRET.");
  process.exit(1);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const data = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ role: "service_role" });
const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
console.log(data + "." + sig);
