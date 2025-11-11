export const filFilter =(req:Express.Request, file:Express.Multer.File , callback:Function)=>{


     //si esta vacio 
     if(!file ) return callback(new Error('file es empty '),false);

     

     const fileExtension= file.mimetype.split('/')[1];
     const validExtensions=['json'];

      if(validExtensions.includes(fileExtension)){
        return callback (null,true)
      }



    console.log(file)

     callback(null,false);



}