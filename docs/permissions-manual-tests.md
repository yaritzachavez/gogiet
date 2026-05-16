# Permissions Manual Tests

1. Cliente intenta entrar a una ruta admin global.
   Resultado esperado: `401` o `403` con mensaje claro.

2. Negocio intenta validar un pago por transferencia.
   Resultado esperado: `403` con mensaje `No tienes permiso para validar pagos.`

3. Vendedor intenta asignar roles globales.
   Resultado esperado: `403` con mensaje de solo administrador general.

4. Repartidor intenta editar productos de negocio.
   Resultado esperado: `403` con mensaje de acceso denegado al negocio.

5. Negocio intenta modificar otro negocio.
   Resultado esperado: `403` con mensaje `No puedes modificar un negocio que no te pertenece.`

6. Cliente intenta ver pedidos de otro cliente.
   Resultado esperado: `403`.

7. Admin general valida pago.
   Resultado esperado: `200`, auditoría registrada y cambio aplicado.

8. Admin general asigna o remueve rol.
   Resultado esperado: `200`, auditoría registrada.

9. Vendedor ve pedidos de su negocio.
   Resultado esperado: `200`.

10. Repartidor marca entregado solo en pedido asignado.
    Resultado esperado: `200` si está asignado; `403` si es de otro repartidor.
