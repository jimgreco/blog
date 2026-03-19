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
      region: process.env.DYNAMO_REGION ?? process.env.AWS_REGION ?? "not set",
    },
  })
}
