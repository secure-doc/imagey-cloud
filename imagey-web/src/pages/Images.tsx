interface ImagesProperties {
  privateKey?: JsonWebKey;
}

export default function Images({ privateKey }: ImagesProperties) {
  return (
    <main>
      <p>{privateKey ? "Keine Bilder vorhanden" : "Bilder werden geladen"}</p>
    </main>
  );
}
