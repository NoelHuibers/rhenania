import VerifyEmailPage from "~/components/auth/VerifyEmail";
import { verifyEmailAndSetPassword } from "~/server/actions/verifyEmail";

export default function Page() {
  return (
    <VerifyEmailPage verifyEmailAndSetPassword={verifyEmailAndSetPassword} />
  );
}
