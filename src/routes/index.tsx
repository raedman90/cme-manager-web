import { createBrowserRouter } from "react-router-dom";
import RootShell from "@/routes/RootShell";
import App from "@/App";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Materials from "@/pages/Materials";
import Batches from "@/pages/Batches";
import Cycles from "@/pages/Cycles";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import ProtectedRoute from "@/routes/ProtectedRoute";
import NotFound from "@/pages/NotFound";
import TraceabilityPage from "@/pages/TraceabilityPage";

// 👇 import CORRETO da página (não do lucide-react)
import Users from "@/pages/Users";
import UsersNew from "@/pages/UsersNew";
import UsersEdit from "@/pages/UsersEdit";
import MaterialHistory from "@/pages/MaterialHistory";
import MaterialsHistoryIndex from "@/pages/MaterialsHistoryIndex";
import AlertsPage from "@/pages/AlertsPage";

export const router = createBrowserRouter([
  {
    element: <RootShell />,
    children: [
      { path: "/login", element: <Login /> },

      {
        element: <ProtectedRoute />, // autenticado
        children: [
          {
            path: "/",
            element: <App />,
            children: [
              { index: true, element: <Dashboard /> },
              { path: "materials", element: <Materials /> },
              // 👇 NOVA rota do índice
              { path: "materials/history", element: <MaterialsHistoryIndex /> },
              // 👇 nova rota de histórico por material
              { path: "materials/:id/history", element: <MaterialHistory /> },
              { path: "batches", element: <Batches /> },
              { path: "cycles", element: <Cycles /> },
              { path: "alerts", element: <AlertsPage /> },
              { path: "reports", element: <Reports /> },
              { path: "settings", element: <Settings /> },
              { path: "traceability", element: <TraceabilityPage /> },

              // 🔐 Somente ADMIN
              {
                element: <ProtectedRoute roles={["ADMIN"]} />,
                children: [
                  { path: "users", element: <Users /> },
                  { path: "users/new", element: <UsersNew /> },
                  { path: "users/:id", element: <UsersEdit /> },
                ],
              },

              { path: "*", element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);
