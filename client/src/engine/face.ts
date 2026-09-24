// Twarz postaci rysowana na płótnie 128x128 - używa jej model 3D i miniaturki awatarów (bez Babylona).

export function drawFace(ctx: CanvasRenderingContext2D, face: string) {
  const W = 128;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  const eyes = (y = 50, r = 8) => {
    ctx.beginPath();
    ctx.ellipse(44, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.ellipse(84, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (face) {
    case "grin":
      eyes();
      ctx.beginPath();
      ctx.moveTo(36, 74);
      ctx.quadraticCurveTo(64, 112, 92, 74);
      ctx.closePath();
      ctx.fill();
      break;
    case "cool":
      ctx.fillRect(28, 40, 72, 8);
      ctx.fillRect(30, 44, 30, 18);
      ctx.fillRect(68, 44, 30, 18);
      ctx.beginPath();
      ctx.arc(64, 72, 18, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    case "wow":
      eyes(48, 10);
      ctx.beginPath();
      ctx.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "angry":
      eyes(56);
      ctx.beginPath();
      ctx.moveTo(32, 36);
      ctx.lineTo(54, 46);
      ctx.moveTo(96, 36);
      ctx.lineTo(74, 46);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 98, 18, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      break;
    default: // smile
      eyes();
      ctx.beginPath();
      ctx.arc(64, 70, 22, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
  }
}
