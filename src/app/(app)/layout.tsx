import { FiltersProvider } from "@/components/FiltersProvider";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FiltersProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar />
          <main className="flex-1 w-full max-w-[1520px] mx-auto px-6 py-6">{children}</main>
        </div>
      </div>
    </FiltersProvider>
  );
}
