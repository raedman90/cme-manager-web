import { Outlet } from "react-router-dom";
import ProgressBar from "@/components/common/ProgressBar";
import { Toaster } from "@/components/ui/toaster";

export default function RootShell() {
  return (
    <>
      <ProgressBar />
      <Outlet />
      <Toaster />
    </>
  );
}
