import {v4 as uuid } from 'uuid'

export const fileName =(req:Express.Request, file:Express.Multer.File , callback:Function)=>{


    //si esta vacio 
    if(!file ) return callback(new Error('file es empty '),false);

    

    const fileExtension= file.mimetype.split('/')[1];
    //const validExtensions=['jpg','jpeg','png','gif'];

    const filename=`${uuid()}.${fileExtension}`;

    //  if(validExtensions.includes(fileExtension)){
    //    return callback (null,true)
    //  }



    //console.log(file)

    callback(null,filename);
}