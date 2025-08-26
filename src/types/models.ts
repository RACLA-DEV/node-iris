/**
 * TypeScript port of iris.bot.models
 */

import { IIrisAPI } from './interfaces';

export interface IrisRawData {
  [key: string]: any;
}

export interface IrisRequest {
  raw: IrisRawData;
  room: string;
  sender: string;
}

export class Message {
  public id: string;
  public type: number;
  public msg: string;
  public attachment: any;
  public v: Record<string, any>;
  public command: string;
  public param?: string;
  public hasParam: boolean;
  public image?: ChatImage;

  constructor(
    id: number | string,
    type: number,
    msg: string,
    attachment: any,
    v: Record<string, any>
  ) {
    this.id = String(id); // ID를 항상 문자열로 변환
    this.type = type;
    this.msg = msg;
    this.v = v;

    // Parse attachment
    try {
      this.attachment =
        typeof attachment === 'string' ? JSON.parse(attachment) : attachment;
    } catch {
      this.attachment = attachment;
    }

    // Parse command and param
    const parts = this.msg.split(' ');
    this.command = parts[0] || '';
    this.hasParam = parts.length > 1;
    this.param = this.hasParam ? parts.slice(1).join(' ') : undefined;

    // Check if message contains image
    const imageTypes = [71, 27, 2, 71 + 16384, 27 + 16384, 2 + 16384];
    if (imageTypes.includes(this.type)) {
      this.image = new ChatImage(this);
    }

    // Handle long messages with attachment path
    if (this.msg.length >= 3900 && this.attachment?.path) {
      this.loadLongMessage();
    }
  }

  private async loadLongMessage(): Promise<void> {
    try {
      const axios = require('axios');
      const response = await axios.get(
        `https://dn-m.talk.kakao.com/${this.attachment.path}`,
        {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-iris)' },
        }
      );
      response.encoding = 'utf-8';
      this.msg = response.data;
    } catch (error) {
      console.error('Failed to load long message:', error);
    }
  }

  toString(): string {
    return `Message(id=${this.id}, type=${this.type}, msg=${this.msg})`;
  }
}

export class Room {
  public id: string;
  public name: string;
  private _api: IIrisAPI;
  private _type?: string | null;

  constructor(id: number | string, name: string, api: IIrisAPI) {
    this.id = String(id); // ID를 항상 문자열로 변환
    this.name = name;
    this._api = api;
  }

  async getType(): Promise<string | null> {
    if (this._type !== undefined) {
      return this._type as string | null;
    }

    try {
      const results = await this._api.query(
        'SELECT type FROM chat_rooms WHERE id = ?',
        [this.id]
      );

      if (results && results[0]) {
        this._type = results[0].type;
        return this._type as string | null;
      }

      this._type = null;
      return null;
    } catch (error) {
      this._type = null;
      return null;
    }
  }

  toString(): string {
    return `Room(id=${this.id}, name=${this.name})`;
  }
}

export class Avatar {
  private _id: string;
  private _chatId: string;
  private _api: IIrisAPI;
  private _url?: string | null;
  private _img?: Buffer | null;

  constructor(id: number | string, chatId: number | string, api: IIrisAPI) {
    this._id = String(id);
    this._chatId = String(chatId);
    this._api = api;
  }

  async getUrl(): Promise<string | null> {
    if (this._url !== undefined) {
      return this._url as string | null;
    }

    try {
      let results: any[];

      if (BigInt(this._id) < 10000000000n) {
        results = await this._api.query(
          'SELECT T2.o_profile_image_url FROM chat_rooms AS T1 JOIN db2.open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this._chatId]
        );
        this._url = results[0]?.o_profile_image_url || null;
      } else {
        results = await this._api.query(
          'SELECT original_profile_image_url FROM db2.open_chat_member WHERE user_id = ?',
          [this._id]
        );
        this._url = results[0]?.original_profile_image_url || null;
      }

      return this._url as string | null;
    } catch (error) {
      this._url = null;
      return null;
    }
  }

  async getImg(): Promise<Buffer | null> {
    if (this._img !== undefined) {
      return this._img;
    }

    const url = await this.getUrl();

    if (!url) {
      this._img = null;
      return null;
    }

    try {
      const axios = require('axios');
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-iris)' },
      });
      this._img = Buffer.from(response.data);
      return this._img;
    } catch (error) {
      console.error('Failed to load avatar image:', error);
      this._img = null;
      return null;
    }
  }

  toString(): string {
    return `Avatar(url=${this._url})`;
  }
}

export class User {
  public id: string;
  public avatar: Avatar;
  private _chatId: string;
  private _api: IIrisAPI;
  private _name?: string | null;
  private _botId?: string;
  private _type?: string | null;

  constructor(
    id: number | string,
    chatId: number | string,
    api: IIrisAPI,
    name?: string,
    botId?: number | string
  ) {
    this.id = String(id);
    this._chatId = String(chatId);
    this._api = api;
    this._name = name;
    this._botId = botId ? String(botId) : undefined;
    this.avatar = new Avatar(id, chatId, api);
  }

  async getName(): Promise<string | null> {
    if (this._name !== undefined) {
      return this._name as string | null;
    }

    try {
      let results: any[];

      if (this.id === this._botId) {
        results = await this._api.query(
          'SELECT T2.nickname FROM chat_rooms AS T1 JOIN db2.open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this._chatId]
        );
        this._name = results[0]?.nickname || null;
      } else if (BigInt(this.id) < 10000000000n) {
        results = await this._api.query(
          'SELECT name FROM db2.friends WHERE id = ?',
          [this.id]
        );
        this._name = results[0]?.name || null;
      } else {
        results = await this._api.query(
          'SELECT nickname FROM db2.open_chat_member WHERE user_id = ?',
          [this.id]
        );
        this._name = results[0]?.nickname || null;
      }

      return this._name as string | null;
    } catch (error) {
      this._name = null;
      return null;
    }
  }

  async getType(): Promise<string | null> {
    if (this._type !== undefined) {
      return this._type;
    }

    try {
      let results: any[];

      if (this.id === this._botId) {
        results = await this._api.query(
          'SELECT T2.link_member_type FROM chat_rooms AS T1 INNER JOIN open_profile AS T2 ON T1.link_id = T2.link_id WHERE T1.id = ?',
          [this._chatId]
        );
      } else {
        results = await this._api.query(
          'SELECT link_member_type FROM db2.open_chat_member WHERE user_id = ?',
          [this.id]
        );
      }

      const memberType = parseInt(results[0]?.link_member_type || '0');

      switch (memberType) {
        case 1:
          this._type = 'HOST';
          break;
        case 2:
          this._type = 'NORMAL';
          break;
        case 4:
          this._type = 'MANAGER';
          break;
        case 8:
          this._type = 'BOT';
          break;
        default:
          this._type = 'UNKNOWN';
      }

      return this._type;
    } catch (error) {
      this._type = 'REAL_PROFILE';
      return this._type;
    }
  }

  toString(): string {
    return `User(name=${this._name})`;
  }
}

export class ChatImage {
  public url: string[];
  private _img?: Buffer[] | null;

  constructor(message: Message) {
    this.url = this.getPhotoUrl(message);
  }

  async getImg(): Promise<Buffer[] | null> {
    if (this._img !== undefined) {
      return this._img;
    }

    if (!this.url || this.url.length === 0) {
      this._img = null;
      return null;
    }

    try {
      const axios = require('axios');
      const images: Buffer[] = [];

      for (const url of this.url) {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; node-iris)' },
        });
        images.push(Buffer.from(response.data));
      }

      this._img = images;
      return this._img;
    } catch (error) {
      console.error('Failed to load chat images:', error);
      this._img = null;
      return null;
    }
  }

  private getPhotoUrl(message: Message): string[] {
    try {
      const urls: string[] = [];

      if (message.type === 71) {
        // Multi photo message
        const thl = message.attachment?.C?.THL;
        if (Array.isArray(thl)) {
          for (const item of thl) {
            if (item.TH?.THU) {
              urls.push(item.TH.THU);
            }
          }
        }
      } else if (message.type === 27) {
        // Single photo message
        const imageUrls = message.attachment?.imageUrls;
        if (Array.isArray(imageUrls)) {
          urls.push(...imageUrls);
        }
      } else if (message.type === 2) {
        // Photo with text
        const imageUrl = message.attachment?.imageUrl;
        if (imageUrl) {
          urls.push(imageUrl);
        }
      }

      return urls;
    } catch (error) {
      console.error('Failed to parse image URLs:', error);
      return [];
    }
  }
}

export class ChatContext {
  public room: Room;
  public sender: User;
  public message: Message;
  public raw: IrisRawData;
  public api: IIrisAPI;

  constructor(
    room: Room,
    sender: User,
    message: Message,
    raw: IrisRawData,
    api: IIrisAPI
  ) {
    this.room = room;
    this.sender = sender;
    this.message = message;
    this.raw = raw;
    this.api = api;
  }

  async reply(message: string, roomId?: string | number): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    await this.api.reply(targetRoomId, message);
  }

  async replyMedia(files: Buffer[], roomId?: string | number): Promise<void> {
    const targetRoomId = roomId || this.room.id;
    await this.api.replyMedia(targetRoomId, files);
  }

  async getSource(): Promise<ChatContext | null> {
    // Check if this message is a reply
    const replyData = this.raw.attachment?.reply;
    if (!replyData) {
      return null;
    }

    try {
      // Get the source message from the API
      const sourceMessage = await this.api.query(
        'SELECT * FROM messages WHERE id = ? AND chat_id = ?',
        [replyData.src_logId, this.room.id]
      );

      if (!sourceMessage || sourceMessage.length === 0) {
        return null;
      }

      // Create ChatContext for source message
      const source = sourceMessage[0];
      const sourceRoom = new Room(this.room.id, this.room.name, this.api);
      const sourceUser = new User(
        source.user_id, // parseInt 제거
        this.room.id,
        this.api,
        source.sender_name
      );
      const sourceMsg = new Message(
        source.id, // parseInt 제거
        parseInt(source.type),
        source.message,
        source.attachment,
        JSON.parse(source.v || '{}')
      );

      return new ChatContext(
        sourceRoom,
        sourceUser,
        sourceMsg,
        source,
        this.api
      );
    } catch (error) {
      console.error('Failed to get source message:', error);
      return null;
    }
  }

  async getNextChat(n: number = 1): Promise<ChatContext | null> {
    try {
      const nextMessages = await this.api.query(
        'SELECT * FROM messages WHERE chat_id = ? AND id > ? ORDER BY id ASC LIMIT ?',
        [this.room.id, this.message.id, n]
      );

      if (!nextMessages || nextMessages.length === 0) {
        return null;
      }

      const next = nextMessages[n - 1] || nextMessages[nextMessages.length - 1];
      const nextRoom = new Room(this.room.id, this.room.name, this.api);
      const nextUser = new User(
        next.user_id, // parseInt 제거
        this.room.id,
        this.api,
        next.sender_name
      );
      const nextMsg = new Message(
        next.id, // parseInt 제거
        parseInt(next.type),
        next.message,
        next.attachment,
        JSON.parse(next.v || '{}')
      );

      return new ChatContext(nextRoom, nextUser, nextMsg, next, this.api);
    } catch (error) {
      console.error('Failed to get next chat:', error);
      return null;
    }
  }

  async getPreviousChat(n: number = 1): Promise<ChatContext | null> {
    try {
      const prevMessages = await this.api.query(
        'SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?',
        [this.room.id, this.message.id, n]
      );

      if (!prevMessages || prevMessages.length === 0) {
        return null;
      }

      const prev = prevMessages[n - 1] || prevMessages[prevMessages.length - 1];
      const prevRoom = new Room(this.room.id, this.room.name, this.api);
      const prevUser = new User(
        prev.user_id, // parseInt 제거
        this.room.id,
        this.api,
        prev.sender_name
      );
      const prevMsg = new Message(
        prev.id, // parseInt 제거
        parseInt(prev.type),
        prev.message,
        prev.attachment,
        JSON.parse(prev.v || '{}')
      );

      return new ChatContext(prevRoom, prevUser, prevMsg, prev, this.api);
    } catch (error) {
      console.error('Failed to get previous chat:', error);
      return null;
    }
  }
}

export class ErrorContext {
  public event: string;
  public func: Function;
  public exception: Error;
  public args: any[];

  constructor(event: string, func: Function, exception: Error, args: any[]) {
    this.event = event;
    this.func = func;
    this.exception = exception;
    this.args = args;
  }

  toString(): string {
    return `ErrorContext(event=${this.event}, error=${this.exception.message})`;
  }
}
