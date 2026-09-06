import { Suspense } from "react";
import RoomClient from "./RoomClient";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <RoomClient code={code.toUpperCase()} />
    </Suspense>
  );
}
