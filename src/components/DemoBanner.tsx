import { Link } from "react-router-dom";
import { Info, LayoutDashboard, RotateCcw, Store } from "lucide-react";
import { IS_DEMO } from "@/integrations/supabase/client";
import { resetDemoData } from "@/integrations/supabase/demo-client";

// Faixa fixa no topo enquanto o app roda sem Supabase (modo demonstração).
export function DemoBanner({ lado = "loja" }: { lado?: "loja" | "cliente" }) {
  if (!IS_DEMO) return null;

  const reset = () => {
    resetDemoData();
    window.location.reload();
  };

  return (
    <div className="bg-[var(--color-accent)] text-white text-xs sm:text-sm">
      <div className="container mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          Demonstração com dados fictícios: pode testar à vontade, nada é salvo em servidor.
        </span>
        <span className="inline-flex items-center gap-3">
          {lado === "loja" ? (
            <Link to="/cardapio-online" className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80">
              <Store className="h-3.5 w-3.5" aria-hidden /> Ver cardápio do cliente
            </Link>
          ) : (
            <Link to="/" className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80">
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Ver painel da loja
            </Link>
          )}
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar dados
          </button>
        </span>
      </div>
    </div>
  );
}
