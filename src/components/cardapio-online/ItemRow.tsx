import { useEffect, useState } from "react";
import { Minus, Plus, Flame, X } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { displayName } from "@/lib/cardapio-online";

export type ItemPublico = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  unit_type: string;
  stock: number | null;
  photo_url: string | null;
};

type Props = {
  item: ItemPublico;
  quantidade: number;
  maisPedido: boolean;
  lojaAberta: boolean;
  onAdd: () => void;
  onRemove: () => void;
};

// Linha de item no estilo dos apps de delivery: texto à esquerda, foto (se houver) à direita,
// botão de adicionar sempre no mesmo lugar e com área de toque >= 44px.
export default function ItemRow({ item, quantidade, maisPedido, lojaAberta, onAdd, onRemove }: Props) {
  const esgotado = item.stock != null && item.stock <= 0;
  const ultimas = !esgotado && item.stock != null && item.stock <= 5;
  const noLimite = item.stock != null && quantidade >= item.stock;
  const nome = displayName(item.name);
  const desabilitado = esgotado || !lojaAberta;
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    if (!ampliada) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAmpliada(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [ampliada]);

  return (
    <article
      className={`flex gap-3 py-4 ${esgotado ? "opacity-55" : ""}`}
      aria-label={`${nome}, ${formatBRL(item.price)}${esgotado ? ", esgotado" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {maisPedido && !esgotado && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
              <Flame className="h-3 w-3" aria-hidden /> Mais pedido
            </span>
          )}
          {ultimas && (
            <span className="rounded-full bg-[var(--color-warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
              {item.stock === 1 ? "Última unidade" : `Últimas ${item.stock}`}
            </span>
          )}
          {esgotado && (
            <span className="rounded-full bg-[var(--color-danger-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
              Esgotado hoje
            </span>
          )}
        </div>
        <h3 className="font-heading font-semibold text-[16px] leading-snug text-[var(--color-text-primary)]">{nome}</h3>
        {item.description && (
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)] line-clamp-2">{item.description}</p>
        )}
        <p className="mt-2 font-heading font-bold text-[17px] text-[var(--color-text-primary)]">
          {formatBRL(item.price)}
          {item.unit_type === "kg" && <span className="ml-0.5 text-sm font-medium text-[var(--color-text-muted)]">/kg</span>}
        </p>
      </div>

      <div className="relative shrink-0 flex flex-col items-end justify-between gap-2">
        {item.photo_url && (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            aria-label={`Ver foto de ${nome}`}
            className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <img
              src={item.photo_url}
              alt=""
              loading="lazy"
              width={112}
              height={112}
              className="h-28 w-28 rounded-xl object-cover bg-[var(--color-surface-secondary)]"
            />
          </button>
        )}
        {ampliada && item.photo_url && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Foto de ${nome}`}
            onClick={() => setAmpliada(false)}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
          >
            <button
              type="button"
              autoFocus
              onClick={() => setAmpliada(false)}
              aria-label="Fechar foto"
              className="absolute right-3 top-3 h-11 w-11 flex items-center justify-center rounded-full bg-white/15 text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <img src={item.photo_url} alt={nome} className="max-h-[75vh] w-full max-w-md rounded-2xl object-contain" />
            <p className="text-center font-heading font-semibold text-white">{nome} · {formatBRL(item.price)}</p>
          </div>
        )}

        <div className={item.photo_url ? "relative z-10 -mt-9 mr-1.5" : ""}>
        {quantidade > 0 ? (
          <div className="flex items-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-sm" role="group" aria-label={`Quantidade de ${nome}`}>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remover um ${nome}`}
              className="h-11 w-11 flex items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-7 text-center font-heading font-bold tabular-nums" aria-live="polite">{quantidade}</span>
            <button
              type="button"
              onClick={onAdd}
              disabled={desabilitado || noLimite}
              aria-label={`Adicionar mais um ${nome}`}
              className="h-11 w-11 flex items-center justify-center rounded-full text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            disabled={desabilitado}
            aria-label={`Adicionar ${nome} à sacola`}
            className="h-11 w-11 inline-flex items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-md transition-transform active:scale-90 hover:bg-[var(--color-accent-muted)] disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
        </div>
      </div>
    </article>
  );
}
