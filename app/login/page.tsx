import { Suspense } from "react";
import LoginClient from "./LoginClient";

// Next.js requires `useSearchParams()` to be wrapped in a Suspense boundary.
// We keep the search-param logic in a client component and render it here.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
