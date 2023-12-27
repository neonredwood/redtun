import { Request, Response } from "express";
import { Socket } from "socket.io";
export const authMiddleWare = (socket: Socket, next: (err?: any) => void) => {
  return next();

  // TODO: check authentication
  // if (!socket.handshake.auth || !socket.handshake.auth.token) {
  //   next(new Error("Authentication error"));
  // }
  // jwt.verify(socket.handshake.auth.token, process.env.SECRET_KEY, function (err, decoded) {
  //   if (err) {
  //     return next(new Error('Authentication error'));
  //   }
  //   if (decoded.token !== process.env.VERIFY_TOKEN) {
  //     return next(new Error('Authentication error'));
  //   }
  //   next();
  // });
};

export const tokenHandler = (req: Request, res: Response) => {
  return res.status(200).send("ok");
  // TODO: check authentication
  //   if (!process.env.JWT_GENERATOR_USERNAME || !process.env.JWT_GENERATOR_PASSWORD) {
  //     res.status(404);
  //     res.send('Not found');
  //     return;
  //   }
  //   if (
  //     req.query.username === process.env.JWT_GENERATOR_USERNAME &&
  //     req.query.password === process.env.JWT_GENERATOR_PASSWORD
  //   ) {
  //     const jwtToken = jwt.sign({ token: process.env.VERIFY_TOKEN }, process.env.SECRET_KEY);
  //     res.status(200);
  //     res.send(jwtToken);
  //     return;
  //   }
  //   res.status(401);
  //   res.send('Forbidden');
  // })
};
