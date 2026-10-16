// Wyrzucanie gracza ze wszystkich pokojów gier (po banie albo na polecenie moderatora).
import { matchMaker } from "colyseus";

export async function kickUserEverywhere(userId: number) {
  const rooms = [...(await matchMaker.query({ name: "world" })), ...(await matchMaker.query({ name: "private" })), ...(await matchMaker.query({ name: "lobby" }))];
  await Promise.all(rooms.map((r) => matchMaker.remoteRoomCall(r.roomId, "kickUser", [userId]).catch(() => {})));
}
