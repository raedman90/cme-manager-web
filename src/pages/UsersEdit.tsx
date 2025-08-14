import { useQuery } from "@tanstack/react-query";
import { getUserById } from "@/api/users";
import UserForm from "@/components/users/UserForm";
import { useParams, useNavigate } from "react-router-dom";

export default function UsersEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["users", id],
    queryFn: () => getUserById(id),
    enabled: !!id,
  });

  if (isLoading) return <div>Carregando…</div>;
  if (!data) return <div>Funcionário não encontrado.</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar Funcionário</h1>
      <UserForm user={data} onSuccess={() => navigate("/users")} />
    </div>
  );
}
