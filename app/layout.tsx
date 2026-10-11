import "./globals.css";

export const metadata = {
  title: "Brand Studio   Automated Visual Identity & Brand Packs",
  description:
    "Générateur haute fidélité d'identités de marque déterministes, de chartes graphiques complètes, d'assets print & digital et de mockups de présentation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
