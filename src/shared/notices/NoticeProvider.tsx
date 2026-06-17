import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type NoticeTone = "info" | "success" | "warning" | "error";

type NoticeContextValue = {
  notify: (message: string, tone?: NoticeTone) => void;
};

type Notice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

const NoticeContext = createContext<NoticeContextValue | undefined>(undefined);
let nextNoticeId = 1;

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [],
  );

  const notify = useCallback(
    (message: string, tone: NoticeTone = "info") => {
      const id = nextNoticeId++;

      setNotices((current) => [...current, { id, message, tone }]);

      const timer = setTimeout(() => {
        setNotices((current) => current.filter((notice) => notice.id !== id));
        timers.current.delete(id);
      }, 5_000);

      timers.current.set(id, timer);
    },
    [],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <section
        aria-atomic="false"
        aria-label="Notifications"
        aria-live="polite"
        className="notice-stack"
      >
        {notices
          .filter((notice) => notice.tone !== "error")
          .map((notice) => (
            <div
              key={notice.id}
              className="notice"
              data-tone={notice.tone}
            >
              {notice.message}
            </div>
          ))}
      </section>
      <div aria-label="Error notifications" className="notice-stack">
        {notices
          .filter((notice) => notice.tone === "error")
          .map((notice) => (
            <div
              aria-live="assertive"
              className="notice"
              data-tone={notice.tone}
              key={notice.id}
              role="alert"
            >
              {notice.message}
            </div>
          ))}
      </div>
    </NoticeContext.Provider>
  );
}

export function useNotice() {
  const context = useContext(NoticeContext);

  if (!context) {
    throw new Error("useNotice must be used within a NoticeProvider.");
  }

  return context;
}
