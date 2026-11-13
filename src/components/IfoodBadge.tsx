import { formatBRL } from "@/lib/format";

type Props = {
  // false: só a linha de cobrança (quando a tela já mostra o selo "iFood #n" ao lado do nome)
  showTag?: boolean;
  order: {
    source?: string | null;
    display_id?: string | null;
    ifood_pedidos?: {
      valor_a_cobrar: number;
      forma_cobranca: string | null;
      troco_para: number | null;
      is_test: boolean;
    } | null;
  };
};

// Selo do pedido do iFood + o que o entregador precisa cobrar (ou não) na entrega.
export default function IfoodBadge({ order, showTag = true }: Props) {
  if (order.source !== "ifood") return null;
  const fin = order.ifood_pedidos;
  const cobrar = Number(fin?.valor_a_cobrar ?? 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 mt-1">
      {showTag && <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide bg-[#ea1d2c] text-white">
        iFood{order.display_id ? ` #${order.display_id}` : ""}{fin?.is_test ? " · teste" : ""}
      </span>}
      {fin && (cobrar > 0 ? (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
          Cobrar {formatBRL(cobrar)}{fin.forma_cobranca ? ` · ${fin.forma_cobranca}` : ""}{fin.troco_para ? ` · troco p/ ${formatBRL(fin.troco_para)}` : ""}
        </span>
      ) : (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--color-success-bg)] text-[var(--color-success)]">
          Pago no iFood — não cobrar
        </span>
      ))}
    </span>
  );
}
