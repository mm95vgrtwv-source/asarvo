import Link from "next/link";
import { login, signup } from "./actions";

type Params = {
  error?: string | string[];
  success?: string | string[];
  mode?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const error = first(params.error);
  const success = first(params.success);
  const signupMode = first(params.mode) === "signup";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-10 text-white">
      <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[620px] w-[850px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-[-300px] left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[150px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <div className="w-full">
          <Link
            href="/"
            className="mb-8 inline-flex text-sm text-gray-500 transition hover:text-white"
          >
            ← Wróć do ASARVO
          </Link>

          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="text-center">
              <div className="text-xl font-bold tracking-tight">
                <span className="text-blue-400">A</span>SARVO
              </div>

              <h1 className="mt-5 text-3xl font-bold tracking-tight">
                {signupMode ? "Utwórz konto" : "Zaloguj się"}
              </h1>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                {signupMode
                  ? "Historia, ulubione i obserwowane ceny na jednym koncie."
                  : "Zaloguj się do swojego konta ASARVO."}
              </p>
            </div>

            {success && (
              <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3 text-sm leading-6 text-emerald-200">
                <div className="font-semibold text-emerald-300">
                  ✓ Rejestracja zakończona
                </div>

                <div className="mt-1">
                  {success}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <form className="mt-7 space-y-4">
              {signupMode && (
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Nazwa
                  </span>

                  <input
                    name="displayName"
                    type="text"
                    maxLength={80}
                    autoComplete="name"
                    placeholder="Np. Artur"
                    className="min-h-14 w-full rounded-xl border border-white/10 bg-black/25 px-4 outline-none transition placeholder:text-gray-700 focus:border-blue-500/40"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-600">
                  E-mail
                </span>

                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ty@example.com"
                  className="min-h-14 w-full rounded-xl border border-white/10 bg-black/25 px-4 outline-none transition placeholder:text-gray-700 focus:border-blue-500/40"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-600">
                  Hasło
                </span>

                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={
                    signupMode ? "new-password" : "current-password"
                  }
                  placeholder="Minimum 6 znaków"
                  className="min-h-14 w-full rounded-xl border border-white/10 bg-black/25 px-4 outline-none transition placeholder:text-gray-700 focus:border-blue-500/40"
                />
              </label>

              {signupMode ? (
                <button
                  formAction={signup}
                  className="min-h-14 w-full rounded-xl bg-blue-600 px-5 font-semibold transition hover:bg-blue-500"
                >
                  Utwórz konto
                </button>
              ) : (
                <button
                  formAction={login}
                  className="min-h-14 w-full rounded-xl bg-blue-600 px-5 font-semibold transition hover:bg-blue-500"
                >
                  Zaloguj się
                </button>
              )}
            </form>

            <div className="mt-6 border-t border-white/[0.06] pt-6 text-center text-sm text-gray-500">
              {signupMode ? (
                <>
                  Masz już konto?{" "}
                  <Link
                    href="/login"
                    className="font-medium text-blue-400 hover:text-blue-300"
                  >
                    Zaloguj się
                  </Link>
                </>
              ) : (
                <>
                  Nie masz konta?{" "}
                  <Link
                    href="/login?mode=signup"
                    className="font-medium text-blue-400 hover:text-blue-300"
                  >
                    Załóż konto
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}