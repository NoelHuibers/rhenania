import { Suspense } from "react";
import VerifyEmailPage from "~/components/auth/VerifyEmail";
import { verifyEmailAndSetPassword } from "~/server/actions/verifyEmail";

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <VerifyEmailPage verifyEmailAndSetPassword={verifyEmailAndSetPassword} />
    </Suspense>
  );
}
