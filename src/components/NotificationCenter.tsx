import React, { useEffect, useState } from "react";
import { Bell, Info, CheckCircle, Smartphone, Calendar, RefreshCw } from "lucide-react";
import { SplitNotification } from "../types";

interface NotificationCenterProps {
  notifications: SplitNotification[];
  onRefresh: () => void;
}

export default function NotificationCenter({ notifications, onRefresh }: NotificationCenterProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const triggerRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-4" id="notifications-box">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Bell className="w-4.5 h-4.5 text-emerald-600 animate-swing" />
          Notifikasi Real-Time Verifikasi ({notifications.length})
        </h3>
        <button
          onClick={triggerRefresh}
          disabled={isRefreshing}
          className="text-slate-400 hover:text-emerald-600 transition-colors p-1 cursor-pointer"
          title="Segarkan notifikasi"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {notifications.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            Belum ada aktivitas transaksional terekam.
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3.5 border rounded-xl flex items-start gap-3 transition-colors ${notif.type === "BILL_COMPLETED"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                  : notif.type === "PAYMENT_RECEIVED"
                    ? "bg-emerald-50/50 border-emerald-200/60 text-emerald-950"
                    : "bg-slate-50/50 border-slate-200 text-slate-800"
                }`}
            >
              <div className="shrink-0 mt-0.5">
                {notif.type === "BILL_COMPLETED" ? (
                  <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md">
                    🎉
                  </div>
                ) : notif.type === "PAYMENT_RECEIVED" ? (
                  <div className="w-7 h-7 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg flex items-center justify-center text-xs">
                    💸
                  </div>
                ) : (
                  <div className="w-7 h-7 bg-slate-100 text-slate-605 border border-slate-200 rounded-lg flex items-center justify-center text-xs">
                    💬
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider font-mono">
                  {notif.billTitle}
                </span>
                <p className="text-xs text-slate-705 leading-normal">{notif.message}</p>
                <span className="text-[9px] text-slate-400 block font-mono">
                  {new Date(notif.timestamp).toLocaleTimeString("id-ID", { hour: "numeric", minute: "numeric" })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-emerald-950 text-white p-4 rounded-xl text-[11px] leading-relaxed block text-center shadow-xs">
        💡 <strong className="text-emerald-300">Tips Pengujian</strong>: Buka aplikasi di Tab baru untuk membagi tagihan secara bersamaan dengan teman lain!
      </div>
    </div>
  );
}
