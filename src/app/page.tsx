import { Suspense } from "react";
import HomeContent from "./_home-content";

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
