import sharp from "sharp";
await sharp("public/bison-icon.svg", { density: 300 })
  .resize(1024, 1024)
  .png()
  .toFile("public/bison-icon-1024.png");
console.log("rendered public/bison-icon-1024.png");
