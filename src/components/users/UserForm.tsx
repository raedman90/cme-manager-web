import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUser, updateUser, uploadUserPhoto, type Role, type UserDTO } from "@/api/users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const roles: Role[] = ["ADMIN", "TECH", "AUDITOR"];

const BaseSchema = z.object({
  name: z.string().min(3, "Mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  role: z.enum(["ADMIN", "TECH", "AUDITOR"]),
  badgeCode: z.string()
    .min(6, "Mínimo 6")
    .max(32, "Máx. 32")
    .regex(/^[A-Z0-9\-]+$/, "Use A–Z, 0–9 e hífen"),
  notes: z.string().max(500).optional(),
});

const CreateSchema = BaseSchema.extend({
  password: z.string().min(8, "Mínimo 8 caracteres"),
  confirmPassword: z.string().min(8, "Mínimo 8 caracteres"),
}).refine((v) => v.password === v.confirmPassword, {
  path: ["confirmPassword"],
  message: "As senhas não coincidem",
});

const UpdateSchema = BaseSchema.extend({
  password: z.string().min(8, "Mínimo 8 caracteres").optional(),
  confirmPassword: z.string().min(8, "Mínimo 8 caracteres").optional(),
}).refine((v) => {
  if (!v.password && !v.confirmPassword) return true;
  return v.password === v.confirmPassword;
}, {
  path: ["confirmPassword"],
  message: "As senhas não coincidem",
});

export type UserFormValues = z.infer<typeof CreateSchema> & z.infer<typeof UpdateSchema>;

export function generateBadgeCode(name?: string) {
  const base = (name ?? "USER").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(2, 8);
  return `${base}-${rand}`;
}

type Props = {
  user?: UserDTO;
  onSuccess?: (u: UserDTO) => void;
  className?: string;
};

export default function UserForm({ user, onSuccess, className }: Props) {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(user?.photoUrl ?? null);
  const [changePassword, setChangePassword] = useState<boolean>(false); // ⬅️ edição
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEdit = !!user;

  const form = useForm<any>({
    resolver: zodResolver(isEdit ? UpdateSchema : CreateSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      role: user?.role ?? "TECH",
      badgeCode: user?.badgeCode ?? generateBadgeCode(user?.name),
      notes: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const mut = useMutation({
    mutationFn: async (values: any) => {
      // monta payload compatível com a API e remove confirmPassword/notes
      const base = {
        name: values.name,
        email: values.email,
        role: values.role,
        badgeCode: values.badgeCode,
        ...(values.password ? { password: values.password } : {}),
      };

      const saved = isEdit ? await updateUser(user!.id, base) : await createUser(base as any);
      if (photoFile) return await uploadUserPhoto(saved.id, photoFile);
      return saved;
    },
    onSuccess: (u) => {
      toast.success(isEdit ? "Funcionário atualizado!" : "Funcionário criado!");
      onSuccess?.(u);
      if (!isEdit) form.reset({ // limpa mas mantém role default
        name: "", email: "", role: "TECH", badgeCode: generateBadgeCode(), notes: "", password: "", confirmPassword: "",
      });
      setPhotoFile(null);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? "Erro ao salvar funcionário");
    },
  });

  return (
    <div className={cn("grid gap-6", className)}>
      <Form {...form}>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-6" onSubmit={form.handleSubmit((v) => mut.mutate(v))}>
          <div className="md:col-span-2 grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl><Input placeholder="Ex.: Maria Souza" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl><Input type="email" placeholder="maria@exemplo.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {roles.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="badgeCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código do Crachá (QR)</FormLabel>
                  <div className="flex gap-2">
                    <FormControl><Input placeholder="EX.: TECH-AB12CD" {...field} /></FormControl>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => form.setValue("badgeCode", generateBadgeCode(form.getValues("name")), { shouldValidate: true })}
                    >
                      Gerar
                    </Button>
                  </div>
                  <FormDescription>Imprimiremos este código no QR do crachá.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Senha - criação SEMPRE; edição só se marcar "alterar senha" */}
            {!isEdit && (
              <>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl><Input type="password" placeholder="Mínimo 8 caracteres" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmar Senha</FormLabel>
                      <FormControl><Input type="password" placeholder="Repita a senha" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {isEdit && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <input
                    id="changePassword"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={changePassword}
                    onChange={(e) => {
                      setChangePassword(e.target.checked);
                      if (!e.target.checked) {
                        form.setValue("password", "");
                        form.setValue("confirmPassword", "");
                      }
                    }}
                  />
                  <Label htmlFor="changePassword">Alterar senha</Label>
                </div>
                {changePassword && (
                  <div className="mt-3 grid gap-3">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nova Senha</FormLabel>
                          <FormControl><Input type="password" placeholder="Mínimo 8 caracteres" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirmar Nova Senha</FormLabel>
                          <FormControl><Input type="password" placeholder="Repita a senha" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (opcional)</FormLabel>
                  <FormControl><Textarea rows={4} placeholder="Observações internas..." {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <Button type="submit" disabled={mut.isPending}>{isEdit ? "Salvar alterações" : "Cadastrar funcionário"}</Button>
              <Button type="button" variant="outline" onClick={() => form.reset()}>Limpar</Button>
            </div>
          </div>

          <div className="md:col-span-1">
            <Label>Foto do Funcionário</Label>
            <div className="mt-2 flex flex-col items-center gap-3">
              <div className="w-40 h-40 rounded-2xl overflow-hidden bg-muted flex items-center justify-center shadow">
                {preview
                  ? <img src={preview} alt="Prévia" className="w-full h-full object-cover" />
                  : <div className="text-sm text-muted-foreground text-center px-3">Sem foto</div>}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
                  {photoFile ? "Trocar foto" : "Enviar foto"}
                </Button>
                {photoFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setPhotoFile(null);
                      setPreview(user?.photoUrl ?? null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
