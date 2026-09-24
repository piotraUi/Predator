// Twarz postaci rysowana na płótnie 128x128 - używa jej model 3D i miniaturki awatarów (bez Babylona).

export function drawFace(ctx: CanvasRenderingContext2D, face: string) {
  const W = 128;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const eyes = (y = 50, r = 8) => {
    ctx.beginPath();
    ctx.ellipse(44, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.ellipse(84, y, r * 0.75, r, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const smile = (y = 70, r = 22) => {
    ctx.beginPath();
    ctx.arc(64, y, r, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const heart = (x: number, y: number, s: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.3, y, x - s * 0.6, y - s * 0.9, x, y - s * 0.2);
    ctx.bezierCurveTo(x + s * 0.6, y - s * 0.9, x + s * 1.3, y, x, y + s * 0.9);
    ctx.fill();
    ctx.fillStyle = "#111";
  };
  const star = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
    ctx.fillStyle = "#111";
  };
  const cheeks = () => {
    ctx.fillStyle = "rgba(255,100,120,.55)";
    ctx.beginPath();
    ctx.ellipse(30, 70, 10, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(98, 70, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
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
      smile(72, 18);
      break;
    case "wow":
      eyes(48, 10);
      ctx.beginPath();
      ctx.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "angry":
      eyes(56);
      line(32, 36, 54, 46);
      line(96, 36, 74, 46);
      ctx.beginPath();
      ctx.arc(64, 98, 18, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      break;
    case "wink":
      ctx.beginPath();
      ctx.ellipse(44, 50, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      line(74, 52, 94, 52);
      smile();
      break;
    case "tongue":
      eyes();
      smile(66, 22);
      ctx.fillStyle = "#ff5c8a";
      ctx.beginPath();
      ctx.ellipse(70, 92, 9, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "blush":
      eyes();
      smile();
      cheeks();
      break;
    case "sad":
      eyes(52);
      ctx.beginPath();
      ctx.arc(64, 100, 18, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = "#4cc9f0";
      ctx.beginPath();
      ctx.ellipse(36, 70, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "sleepy":
      line(34, 52, 54, 52);
      line(74, 52, 94, 52);
      ctx.beginPath();
      ctx.ellipse(64, 84, 7, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("z", 98, 30);
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("z", 110, 16);
      break;
    case "laugh":
      line(32, 42, 52, 52);
      line(32, 62, 52, 52);
      line(96, 42, 76, 52);
      line(96, 62, 76, 52);
      ctx.beginPath();
      ctx.moveTo(36, 74);
      ctx.quadraticCurveTo(64, 112, 92, 74);
      ctx.closePath();
      ctx.fill();
      break;
    case "cat":
      eyes();
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(48, 76);
      ctx.quadraticCurveTo(56, 86, 64, 76);
      ctx.quadraticCurveTo(72, 86, 80, 76);
      ctx.stroke();
      ctx.lineWidth = 3;
      line(10, 66, 34, 70);
      line(10, 78, 34, 76);
      line(118, 66, 94, 70);
      line(118, 78, 94, 76);
      ctx.fillStyle = "#ff8fab";
      ctx.beginPath();
      ctx.moveTo(58, 66);
      ctx.lineTo(70, 66);
      ctx.lineTo(64, 73);
      ctx.fill();
      break;
    case "hearts":
      heart(44, 48, 14, "#ff2e63");
      heart(84, 48, 14, "#ff2e63");
      smile();
      break;
    case "stars":
      star(44, 48, 15, "#ffc300");
      star(84, 48, 15, "#ffc300");
      ctx.beginPath();
      ctx.moveTo(40, 72);
      ctx.quadraticCurveTo(64, 104, 88, 72);
      ctx.closePath();
      ctx.fill();
      break;
    case "dizzy":
      ctx.lineWidth = 4;
      for (const cx of [44, 84]) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 5; a += 0.2) ctx.lineTo(cx + Math.cos(a) * a * 1.1, 50 + Math.sin(a) * a * 1.1);
        ctx.stroke();
      }
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(44, 86);
      ctx.bezierCurveTo(54, 76, 64, 96, 74, 86);
      ctx.stroke();
      break;
    case "nerd":
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(44, 50, 14, 0, Math.PI * 2);
      ctx.moveTo(98, 50);
      ctx.arc(84, 50, 14, 0, Math.PI * 2);
      ctx.stroke();
      line(58, 50, 70, 50);
      eyes(50, 5);
      smile(70, 20);
      ctx.fillStyle = "#fff";
      ctx.fillRect(56, 86, 7, 8);
      ctx.fillRect(65, 86, 7, 8);
      break;
    case "mustache":
      eyes();
      ctx.beginPath();
      ctx.moveTo(64, 74);
      ctx.bezierCurveTo(50, 64, 30, 72, 28, 84);
      ctx.bezierCurveTo(40, 80, 52, 84, 64, 80);
      ctx.bezierCurveTo(76, 84, 88, 80, 100, 84);
      ctx.bezierCurveTo(98, 72, 78, 64, 64, 74);
      ctx.fill();
      line(52, 98, 76, 98);
      break;
    case "vampire":
      eyes();
      line(32, 36, 54, 42);
      line(96, 36, 74, 42);
      smile(68, 22);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(50, 86);
      ctx.lineTo(56, 86);
      ctx.lineTo(53, 98);
      ctx.moveTo(72, 86);
      ctx.lineTo(78, 86);
      ctx.lineTo(75, 98);
      ctx.fill();
      break;
    case "pirateface":
      ctx.beginPath();
      ctx.ellipse(44, 50, 6, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(84, 50, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      line(20, 30, 108, 60);
      ctx.lineWidth = 7;
      smile();
      break;
    case "robot":
      ctx.fillStyle = "#3a86ff";
      ctx.fillRect(30, 40, 24, 18);
      ctx.fillRect(74, 40, 24, 18);
      ctx.fillStyle = "#111";
      ctx.fillRect(36, 80, 56, 12);
      ctx.fillStyle = "#9aa3ad";
      for (let x = 42; x < 90; x += 12) ctx.fillRect(x, 82, 4, 8);
      break;
    case "clown":
      eyes();
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.arc(64, 66, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e63946";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(64, 72, 28, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = "#111";
      break;
    default: // smile
      eyes();
      smile();
  }
}
