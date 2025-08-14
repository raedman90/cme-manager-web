export type User = {
  id: string
  name: string
  email: string
  occupation?: string | null
  departmentId?: string | null
  photo?: string | null
  adm?: boolean
  role?: string          // <- adicionar
}

export type LoginPayload = {
  email: string
  password: string
}

export type LoginResponse = {
  token: string
  user: User
}