import UserForm from "@/components/users/UserForm";
import { useNavigate } from "react-router-dom";

export default function UsersNew() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cadastrar Funcionário</h1>
      <UserForm onSuccess={() => navigate("/users")} />
    </div>
  );
}
