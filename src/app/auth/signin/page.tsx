import { Suspense } from "react";
import SignInPage from "~/components/auth/SignInPage";

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <SignInPage />
    </Suspense>
  );
}
