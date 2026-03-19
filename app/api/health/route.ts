import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasGoogleId: !!process.env.GOOGLE_CLIENT_ID,
      hasDynamoTable: !!process.env.DYNAMODB_TABLE_NAME,
      hasDynamoCreds: !!process.env.DYNAMO_ACCESS_KEY_ID,
      hasDynoRegion: !!process.env.DYNAMO_REGION,
      hasAdminEmail: !!process.env.ADMIN_EMAIL,
      awsRegion: process.env.AWS_REGION ?? "not set",
      dynoRegion: process.env.DYNAMO_REGION ?? "not set",
      nodeEnv: process.env.NODE_ENV,
      envCount: Object.keys(process.env).length,
    },
  })
}
