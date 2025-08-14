import { api } from "@/api/axios";

export type Role = "ADMIN" | "TECH" | "AUDITOR";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  badgeCode: string;
  photoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: Role;
  badgeCode: string;
  password: string; // ⬅️ agora exigido no create
}

export interface UpdateUserInput extends Partial<CreateUserInput> {
  password?: string; // ⬅️ opcional no update (alteração de senha)
}

export type TechUser = { id: string; name: string; badgeCode: string; role: "TECH" };

export async function listUsers(query?: { q?: string }) {
  const { data } = await api.get<UserDTO[]>("/users", { params: query });
  return data;
}

export async function getUserById(id: string) {
  const { data } = await api.get<UserDTO>(`/users/${id}`);
  return data;
}

export async function createUser(payload: CreateUserInput) {
  const { data } = await api.post<UserDTO>("/users", payload);
  return data;
}

export async function updateUser(id: string, payload: UpdateUserInput) {
  const { data } = await api.patch<UserDTO>(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: string) {
  await api.delete(`/users/${id}`);
}

export async function uploadUserPhoto(id: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post<UserDTO>(`/users/${id}/profile-picture`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export interface ListUsersParams {
  page?: number;
  perPage?: number;
  q?: string;
  role?: "ADMIN" | "TECH" | "AUDITOR";
  sort?: "name" | "email" | "role" | "createdAt" | "updatedAt" | "badgeCode";
  order?: "asc" | "desc";
}

export interface ListUsersResponse {
  data: UserDTO[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  sort: string;
  order: "asc" | "desc";
}

export async function listUsersPaged(params: ListUsersParams = {}) {
  const { data } = await api.get<ListUsersResponse>("/users", { params });
  return data;
}

export async function listTechUsers(): Promise<TechUser[]> {
  const { data } = await api.get("/users", { params: { role: "TECH", perPage: 100 } });
  // aceite formatos diferentes do backend
  const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return arr.map((u: any) => ({ id: u.id, name: u.name ?? u.nome, badgeCode: u.badgeCode ?? u.cracha ?? "", role: "TECH" }));
}

export async function verifyBadge(raw: string): Promise<TechUser> {
  const badgeCode = String(raw || "").trim();
  const { data } = await api.post("/users/verify-badge", { badgeCode });
  const u = data?.user;
  return { id: u.id, name: u.name ?? u.nome, badgeCode: u.badgeCode, role: "TECH" };
}