import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { MessageWsService } from './message-ws.service';
import { NewMessageDto } from './dto/create-message-w.dto';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  path: '/socket.io'
})
export class MessageWsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  
  @WebSocketServer() wss: Server;
  
  constructor(private readonly messagesWsService: MessageWsService) {}

  handleConnection(client: Socket) {
    this.messagesWsService.registerClient(client);
    this.wss.emit('clients-updated', this.messagesWsService.getConectedClients());
    console.log('Cliente conectado:', client.id);
  }

  handleDisconnect(client: Socket) {
    this.messagesWsService.removeClient(client.id);
    this.wss.emit('clients-updated', this.messagesWsService.getConectedClients());
    console.log('Cliente desconectado:', client.id);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, roomId: string) {
    client.join(roomId);
    this.messagesWsService.initializeRoom(roomId);
    console.log(`Cliente ${client.id} se unió a la sala ${roomId}`);
    return { success: true, roomId };
  }

  @SubscribeMessage('editor-update')
  handleEditorUpdate(client: Socket, payload: any) {
    const { roomId, pageIndex, components, styles, timestamp } = payload;
    
    if (client.rooms.has(roomId)) {
      client.to(roomId).emit('editor-update', {
        roomId,
        pageIndex,
        components,
        styles,
        timestamp
      });
    }
  }

  @SubscribeMessage('page-change')
  handlePageChange(client: Socket, payload: any) {
    const { roomId, pageIndex, totalPages, pages, pagescss } = payload;
    
    if (client.rooms.has(roomId)) {
      // Actualizar el estado de las páginas en la sala
      if (totalPages > this.messagesWsService.getRoomPages(roomId)?.pages.length) {
        this.messagesWsService.updateRoomPages(roomId, pages, pagescss);
      }

      // Reenviar los datos a todos los clientes en la misma sala
      client.to(roomId).emit('page-change', {
        roomId,
        pageIndex,
        totalPages,
        pages: this.messagesWsService.getRoomPages(roomId)?.pages,
        pagescss: this.messagesWsService.getRoomPages(roomId)?.pagescss
      });
    }
  }

  @SubscribeMessage('message-from-client')
  handleMessageFromClient(client: Socket, payload: NewMessageDto) {
    console.log('Mensaje recibido:', payload);
  }
}