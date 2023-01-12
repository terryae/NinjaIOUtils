import { Client, EventDispatcher, PVPClient } from "lib";
import { app, App, Layer } from "typings";
import config from "../config";
import hookModMenu from "../hookModMenu";
import Mod from "./Mod";
import Settings from "./Settings";

export type Listener = () => any;
export type PacketListener = (type: "game" | "pvp", packet: any) => any;

export default new (class Ninja {
  public settings = new Settings<{
    enabledMods: string[];
    texturePack: string;
    uiScale: number;
  }>(config.settingsKey, {
    enabledMods: [],
    texturePack: "",
    uiScale: 0,
  });

  constructor() {}
  public init() {
    const ninja = this;
    this.ready = true;
    this.events = new EventDispatcher();

    const stepper = app.stepCallback;
    app.stepCallback = function (...d) {
      try {
        ninja.stepListeners.forEach((l) => l());
      } catch (err) {
        console.error(err);
      }
      return stepper(...d);
    };

    App.Stats.realSetPing = App.Stats.setPing;
    App.Stats.setPing = function (ping) {
      ninja.serverLatency = ping;
      return App.Stats.realSetPing(ping);
    };

    app.onResize = window.eval(
      `(function ${app.onResize
        .toString()
        .replace(`App.Scale=b`, `b=Ninja.settings.get("uiScale")||b,App.Scale=b`)})`
    );
    app.onResize();

    Client.prototype.onMessage = function (_a) {
      const a: any = Client.decompress(_a.data);
      try {
        ninja.clientPacketListeners.forEach((l) => l("game", a));
      } catch (err) {
        console.error(err);
      }
      this.dispatchEvent(a);
    };
    PVPClient.prototype.onMessage = function (_a) {
      const a: any = PVPClient.decompress(_a.data);
      try {
        ninja.clientPacketListeners.forEach((l) => l("pvp", a));
      } catch (err) {
        console.error(err);
      }
      this.dispatchEvent(a);
    };

    hookModMenu();

    this.mods.forEach((m) => m.isInstalled() && m.loadon == "appstart" && m.load());
    this.readyListeners.forEach((l) => l());
  }

  public ready = false;
  public get GameVersion() {
    return (
      document
        .querySelector<HTMLScriptElement>(`script[src*="game.js"]`)
        ?.src.split("/")
        .pop()
        ?.split("?v=")?.[1] ||
      (() => {
        try {
          return App.ClientVersion;
        } catch {
          return "unknown";
        }
      })()
    );
  }
  public serverLatency = 0;
  public mods: Mod[] = [];

  public registerMod(mod: Mod<any>) {
    if (mod.details.draft) return;
    this.mods.push(mod);
  }
  public loadMod(id: string) {
    const mod = this.mods.find((m) => m.id == id);
    if (!mod || mod.loaded || !mod.isInstalled()) return;
    if (this.ready && mod.loadon == "appstart") mod.load();
    else if (mod.loadon == "pagestart") mod.load();
  }

  public log(text: string, color?: number) {
    if (this.ready) App.Console.log(text, color);
    else console.log(text);
  }

  private stepListeners: Listener[] = [];
  public onstep(l: Listener) {
    this.stepListeners.push(l);
    return l;
  }
  public offstep(l: Listener) {
    const i = this.stepListeners.indexOf(l);
    if (i >= 0) this.stepListeners.splice(i, 1);
  }

  private readyListeners: Listener[] = [];
  public onready(l: Listener) {
    this.readyListeners.push(l);
    return l;
  }
  public offready(l: Listener) {
    const i = this.readyListeners.indexOf(l);
    if (i >= 0) this.readyListeners.splice(i, 1);
  }

  private clientPacketListeners: PacketListener[] = [];
  public onClientPacket(l: PacketListener) {
    this.clientPacketListeners.push(l);
    return l;
  }
  public offClientPacket(l: PacketListener) {
    const i = this.clientPacketListeners.indexOf(l);
    if (i >= 0) this.clientPacketListeners.splice(i, 1);
  }

  public gamePassword = "";
  public isGuest() {
    return App.Layer.setup == Layer.SETUP_GUEST;
  }
  public activeMenu() {
    return this.isGuest() ? App.Layer.guestMenu : App.Layer.memberMenu;
  }
  public activeClient() {
    return app.gameClient.socket ? app.gameClient : app.pvpClient.socket ? app.pvpClient : null;
  }
  public inGame() {
    const active = this.activeClient();
    return app.matchStarted && active && active.socket.readyState == WebSocket.OPEN;
  }

  public events: EventDispatcher;
})();
