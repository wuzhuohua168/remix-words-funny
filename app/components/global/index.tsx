import { Toast } from "@heroui/react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useAppTheme } from "~/hooks/useAppTheme";
import { ManageBooksModal } from "./ManageBooksModal";
import { MobileDrawers } from "./MobileDrawers";
import { ProfileModal } from "./ProfileModal";
import { PlanModal } from "./PlanModal";
import { SettingModal } from "./SettingModal";
import { SignInModal } from "./SignInModal";
import { SignUpModal } from "./SignUpModal";
import { UpdatePasswordModal } from "./UpdatePasswordModal";

export function GlobalComponents() {
  useAppTheme();

  return (
    <>
      <Toast.Provider placement="top" />
      <ReactQueryDevtools />
      <SignInModal />
      <SignUpModal />
      <UpdatePasswordModal />
      <SettingModal />
      <PlanModal />
      <ProfileModal />
      <ManageBooksModal />
      <MobileDrawers />
    </>
  );
}
