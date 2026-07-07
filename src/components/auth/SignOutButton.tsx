import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import styles from "./SignOutButton.module.css";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className={styles.button} aria-label="로그아웃">
        <LogOut />
      </button>
    </form>
  );
}
