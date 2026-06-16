export const metadata = {
  title: "Pay When Approved | Aventus Visa Agents",
  description: "Secure payment for the Pay When Approved plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
