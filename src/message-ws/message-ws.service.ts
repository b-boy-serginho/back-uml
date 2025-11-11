import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class MessageWsService {
  private connectedClients: Map<string, Socket> = new Map();
  private roomPages: Map<string, { pages: string[], pagescss: string[] }> = new Map();

  registerClient(client: Socket) {
    this.connectedClients.set(client.id, client);
  }

  removeClient(clientId: string) {
    this.connectedClients.delete(clientId);
  }

  getConectedClients(): string[] {
    return Array.from(this.connectedClients.keys());
  }

  getClientById(clientId: string): Socket | undefined {
    return this.connectedClients.get(clientId);
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  initializeRoom(roomId: string) {
    if (!this.roomPages.has(roomId)) {
      this.roomPages.set(roomId, {
        pages: ['<p>Page 1</p>'],
        pagescss: ['<style>body{background-color: #fff;}</style>']
      });
    }
  }

  getRoomPages(roomId: string) {
    return this.roomPages.get(roomId);
  }

  updateRoomPages(roomId: string, pages: string[], pagescss: string[]) {
    if (this.roomPages.has(roomId)) {
      this.roomPages.set(roomId, { pages, pagescss });
    }
  }
}