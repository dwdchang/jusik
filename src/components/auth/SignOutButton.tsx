import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import styles from "./SignOutButton.module.css";

export function SignOutButton() {
  return (
    <form
      className={styles.form}
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className={styles.button}>
        <LogOut aria-hidden="true" />
        로그아웃
      </button>
    </form>
  );
}
