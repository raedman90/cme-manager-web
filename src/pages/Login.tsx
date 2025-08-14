import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/api/axios";
import logoHorizontal from "@/assets/brand/logo-escudo.png";
import { useEffect } from "react";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres"),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { isAuthenticated } = useAuth();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  
  useEffect(() => {
    if (isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, navigate]);

  async function onSubmit(values: FormData) {
    try {
      setSubmitting(true);

      // Chama seu endpoint de login
      const r = await authApi.post("/auth/login", {
        email: values.email,
        password: values.password,
      });

      // Mapeia tokens e usuário de forma tolerante (camelCase ou snake_case)
      const tokens = {
        accessToken: r.data?.accessToken ?? r.data?.access_token ?? r.data?.token,
        refreshToken: r.data?.refreshToken ?? r.data?.refresh_token ?? null,
      };
      const user = r.data?.user ?? {
        id: r.data?.id ?? "",
        name: r.data?.name ?? "",
        email: r.data?.email ?? values.email,
        role: r.data?.role,
      };

      if (!tokens.accessToken) {
        throw new Error("Resposta de login sem accessToken.");
      }

      // Persiste no contexto (salva no localStorage também)
      signIn({ user, tokens });

      toast({ title: "Bem-vindo!", description: "Login realizado com sucesso." });
      navigate("/", { replace: true });
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Falha ao entrar";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-sm rounded-2xl border p-6">
        <img src={logoHorizontal} alt="CME Manager" className="mx-auto mb-4 h-10 object-contain" />
        <h2 className="text-xl font-semibold text-center mb-4">Acessar</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="voce@exemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Senha</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormDescription className="sr-only">Sua senha</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
