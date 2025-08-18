export function MenuHeader() {
  return (
    <div className="flex-col flex items-center md:items-start space-y-2">
      <div className="flex items-center justify-center">
        <h1 className="text-4xl font-bold tracking-tight">Getränkekarte</h1>
      </div>
      <p className="text-muted-foreground max-w-2xl mx-auto text-center md:text-left">
        Entdecken Sie die eiskalten kühlgestellten Getränke des Getränkewartes.
      </p>
    </div>
  );
}
