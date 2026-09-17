"use client";

import { useCallback, useMemo, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { Download, Pencil, Search, X } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import Pagination from "@/components/Pagination";
import { DELIVERY_OPTIONS, deliveryFreeNote, ORDER_STATUS } from "@/lib/constants";
import { itemsTotalOf } from "@/lib/order-pricing";
import { orderStatusMessage, whatsAppLink } from "@/lib/whatsapp";
import { useToast } from "@/store/toast";
import type { Order } from "@/types";
import { resendOrderNotification } from "./actions";
import { fetchInvoiceFile } from "./invoice-file";
import OrderDeliveryEditor from "./OrderDeliveryEditor";
import OrderItemsEditor from "./OrderItemsEditor";
import OrderStatusSelect from "./OrderStatusSelect";
import ShareInvoiceButton from "./ShareInvoiceButton";
import { useAdminListNav, useDebouncedSearch } from "./useAdminListNav";

type OrderPatch = Partial<Pick<Order, "status" | "items" | "total" | "delivery_type" | "delivery_cost">>;

type Props = {
  orders: Order[];
  page: number;
  totalPages: number;
  total: number;
  q: string;
  statusFilter: string;
  statusCounts: Record<string, number>;
};

export default function AdminOrders({
  orders: initial,
  page,
  totalPages,
  total,
  q,
  statusFilter,
  statusCounts,
}: Props) {
  const navigate = useAdminListNav();
  const search = useDebouncedSearch(q, (value) => navigate({ q: value }));
  // One patch per order rather than a map per field: the total, the items and the delivery fee all
  // move together, and splitting them is how the card came to show a fresh total beside a stale
  // delivery line whenever an edit crossed the free-delivery threshold.
  const [patches, setPatches] = useState<Record<number, OrderPatch>>({});
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingDeliveryId, setEditingDeliveryId] = useState<number | null>(null);

  const patchOrder = useCallback(
    (id: number, next: OrderPatch) => setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...next } })),
    [],
  );

  // Every keystroke in the search box used to recreate all order objects and re-render each
  // OrderItemsEditor and OrderStatusSelect.
  const orders = useMemo(() => initial.map((o) => ({ ...o, ...patches[o.id] })), [initial, patches]);

  const show = useToast((s) => s.show);
  const [resending, setResending] = useState<number | null>(null);
  const [notified, setNotified] = useState<Record<number, boolean>>({});

  async function handleResend(orderId: number) {
    setResending(orderId);
    const result = await resendOrderNotification(orderId);
    setResending(null);
    if (result.ok) {
      setNotified((prev) => ({ ...prev, [orderId]: true }));
      show("Письмо отправлено", "success");
    } else {
      show(result.error, "error");
    }
  }

  const activeStatuses = useMemo(() => new Set(statusFilter ? statusFilter.split(",") : []), [statusFilter]);

  function toggleStatus(key: string) {
    const next = new Set(activeStatuses);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    navigate({ status: [...next].join(",") });
  }

  function handleStatusChange(orderId: number, status: string) {
    patchOrder(orderId, { status });
  }

  async function handleDownloadInvoice(orderId: number) {
    const file = await fetchInvoiceFile(orderId);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Status badges / filters */}
      <div className="flex gap-2 flex-wrap mb-5">
        {Object.entries(ORDER_STATUS).map(([key, { label, cls }]) => {
          const active = activeStatuses.has(key);
          return (
            <Button
              key={key}
              type="button"
              onClick={() => toggleStatus(key)}
              className={`text-xs font-medium px-2 py-1 rounded transition-all ${cls} ${
                active ? "ring-2 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"
              }`}
            >
              {label}: {statusCounts[key] ?? 0}
            </Button>
          );
        })}
        {activeStatuses.size > 0 && (
          <Button
            type="button"
            onClick={() => navigate({ status: "" })}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
          >
            Сбросить ✕
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {search.value && (
          <Button
            onClick={search.clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">Заказов: {total}</p>

      {orders.length === 0 && (
        <p className="text-gray-400 text-sm">{q ? `Ничего не найдено по запросу «${q}»` : "Заказов пока нет"}</p>
      )}

      <div className="space-y-4">
        {orders.map((order) => {
          const date = order.created_at
            ? new Date(order.created_at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—";

          // Built from the patched status, so the text follows the select the admin has just
          // changed rather than the one the page was rendered with.
          const chatHref = whatsAppLink(
            order.customer_phone,
            orderStatusMessage({ orderId: order.id, status: order.status, total: order.total }),
          );

          // Everything the invoice prints from the order, so an edit in either editor throws away
          // the PDF the share button is holding rather than sending the superseded one.
          const invoiceRevision = [
            order.total,
            order.delivery_cost,
            ...(order.items ?? []).map((i) => `${i.id}x${i.quantity}@${i.price}`),
          ].join("|");

          return (
            <div key={order.id} className="border border-gray-300 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-mono text-xs text-gray-400">#{order.id}</p>
                  <p className="text-xs text-gray-400">{date}</p>
                  {!(order.notified_at || notified[order.id]) && (
                    <div className="my-1.5 flex w-fit flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                      {/* "not confirmed", not "not sent": rows predating this tracking are NULL
                          too, and some of those were in fact emailed. */}
                      <span>Отправка письма не подтверждена</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(order.id)}
                        disabled={resending === order.id}
                      >
                        {resending === order.id ? "Отправляем..." : "Отправить"}
                      </Button>
                    </div>
                  )}
                  <p className="mt-1 font-semibold break-words">{order.customer_name ?? "—"}</p>
                  <p className="text-sm text-gray-600">{order.customer_phone ?? "—"}</p>
                  <p className="text-sm break-words text-gray-600">{order.customer_address ?? "—"}</p>
                  {editingDeliveryId === order.id ? (
                    <OrderDeliveryEditor
                      orderId={order.id}
                      deliveryType={order.delivery_type}
                      deliveryCost={order.delivery_cost}
                      itemsTotal={itemsTotalOf(order.items ?? [])}
                      onCancel={() => setEditingDeliveryId(null)}
                      onSaved={(delivery_type, delivery_cost, total) => {
                        patchOrder(order.id, { delivery_type, delivery_cost, total });
                        setEditingDeliveryId(null);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">
                      🚚{" "}
                      {DELIVERY_OPTIONS.find((o) => o.id === order.delivery_type)?.label ??
                        order.delivery_type ??
                        "не указана"}
                      {" — "}
                      {order.delivery_cost > 0 ? (
                        <>
                          {order.delivery_cost} <Currency />
                        </>
                      ) : (
                        // Not a flat "бесплатно": regions is still to be agreed and urgent is paid
                        // to the courier, which is what the customer reads in their own profile.
                        deliveryFreeNote(order.delivery_type)
                      )}{" "}
                      <Button
                        type="button"
                        onClick={() => setEditingDeliveryId(order.id)}
                        className="inline-flex items-center gap-1 align-baseline text-xs text-gray-400 hover:text-gray-700"
                      >
                        <Pencil className="w-3 h-3" /> Изменить
                      </Button>
                    </p>
                  )}
                  {order.comment && <p className="text-sm text-gray-400 italic">💬 {order.comment}</p>}
                </div>
                {/* Narrow screens: one wrapping row so the total, the status select and the
                    invoice link stay left-aligned under the customer block instead of floating
                    in a shrink-to-fit right-aligned column. */}
                <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-end">
                  <p className="text-xl font-bold text-green-600">
                    {order.total} <Currency />
                  </p>
                  <OrderStatusSelect
                    orderId={order.id}
                    currentStatus={order.status}
                    onStatusChange={handleStatusChange}
                  />
                  <Button
                    type="button"
                    onClick={() => handleDownloadInvoice(order.id)}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Накладная
                  </Button>
                  <ShareInvoiceButton orderId={order.id} revision={invoiceRevision} />
                  {chatHref && (
                    <a
                      href={chatHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Откроет чат с готовым текстом — отправляете вы сами"
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <FaWhatsapp className="w-3.5 h-3.5" aria-hidden /> Написать
                    </a>
                  )}
                </div>
              </div>

              {editingOrderId === order.id ? (
                <OrderItemsEditor
                  orderId={order.id}
                  items={order.items}
                  onCancel={() => setEditingOrderId(null)}
                  onSaved={(items, total, delivery_cost) => {
                    patchOrder(order.id, { items, total, delivery_cost });
                    setEditingOrderId(null);
                  }}
                />
              ) : (
                <div className="mt-3 border-t border-gray-300 pt-3">
                  <div className="space-y-1">
                    {(order.items || []).map((item, i) => (
                      <div key={i} className="flex justify-between gap-4 text-sm">
                        <span className="min-w-0 flex-1 truncate text-gray-700">{item.name}</span>
                        <span className="shrink-0 text-gray-500">
                          {item.quantity} × {item.price} <Currency />
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={() => setEditingOrderId(order.id)}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Изменить состав
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => navigate({ page: p })} />
    </>
  );
}
