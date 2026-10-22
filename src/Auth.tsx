import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { X, Music2, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useApp } from "./state";
import { api, json } from "./api";
import type { User } from "../shared/types";
export function AuthModal() {
  const { authMode, setAuthMode, setUser, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setError("");
    if (authMode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [authMode]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      if (authMode === "forgot") {
        const r = await api<{ message: string }>(
          "/auth/forgot-password",
          json("POST", { email: data.get("email") }),
        );
        notify(r.message);
        setAuthMode("login");
      } else {
        const r = await api<{ user: User }>(
          `/auth/${authMode === "signup" ? "register" : "login"}`,
          json("POST", {
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
          }),
        );
        setUser(r.user);
        setAuthMode(null);
        notify(`Bem-vindo${r.user.name ? `, ${r.user.name}` : ""}!`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal auth-modal"
      onCancel={() => setAuthMode(null)}
      onClick={(e) => {
        if (e.target === dialog.current) setAuthMode(null);
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label="Fechar"
        onClick={() => setAuthMode(null)}
      >
        <X />
      </button>
      <div className="auth-logo">
        <Music2 size={36} />
      </div>
      <h2>
        {authMode === "signup"
          ? "Sua música começa aqui."
          : authMode === "forgot"
            ? "Vamos recuperar seu acesso."
            : "Que bom ter você por aqui."}
      </h2>
      <p className="muted">
        {authMode === "signup"
          ? "Crie sua conta e leve seus favoritos com você."
          : authMode === "forgot"
            ? "Digite o e-mail associado à sua conta."
            : "Entre para guardar cada descoberta."}
      </p>
      <form onSubmit={(e) => void submit(e)}>
        {authMode === "signup" && (
          <label>
            Como podemos chamar você?
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              placeholder="Seu nome"
            />
          </label>
        )}
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="voce@exemplo.com"
          />
        </label>
        {authMode !== "forgot" && (
          <label>
            Senha
            <span className="password-input">
              <input
                name="password"
                type={show ? "text" : "password"}
                required
                minLength={authMode === "signup" ? 12 : 1}
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
                placeholder={
                  authMode === "signup"
                    ? "Pelo menos 12 caracteres"
                    : "Sua senha"
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button green full-width" disabled={busy}>
          {busy
            ? "Aguarde…"
            : authMode === "signup"
              ? "Criar conta"
              : authMode === "forgot"
                ? "Enviar instruções"
                : "Entrar"}
        </button>
      </form>
      {authMode === "login" && (
        <button className="text-button" onClick={() => setAuthMode("forgot")}>
          Esqueceu sua senha?
        </button>
      )}
      <div className="auth-bottom">
        {authMode === "login" ? (
          <>
            Ainda não tem conta?{" "}
            <button
              className="text-button"
              onClick={() => setAuthMode("signup")}
            >
              Inscreva-se
            </button>
          </>
        ) : (
          <button className="text-button" onClick={() => setAuthMode("login")}>
            <ArrowLeft size={14} /> Voltar para entrar
          </button>
        )}
      </div>
    </dialog>
  );
}
export function ResetPassword() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const { setAuthMode } = useApp();
  return (
    <div className="page narrow">
      <h1>Uma nova senha, um novo começo.</h1>
      {done ? (
        <>
          <p>Senha atualizada. Entre novamente para ouvir suas músicas.</p>
          <button className="button green" onClick={() => setAuthMode("login")}>
            Entrar
          </button>
        </>
      ) : (
        <form
          className="surface form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            const data = new FormData(e.currentTarget);
            void api(
              "/auth/reset-password",
              json("POST", {
                token: new URLSearchParams(location.search).get("token"),
                password: data.get("password"),
              }),
            )
              .then(() => setDone(true))
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Nova senha
            <input
              required
              minLength={12}
              name="password"
              type="password"
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button green" disabled={busy}>
            Salvar senha
          </button>
        </form>
      )}
    </div>
  );
}
