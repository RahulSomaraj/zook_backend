import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateAdressDto } from './dto/create-adress.dto';
import { UpdateAdressDto } from './dto/update-adress.dto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdressesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, createAdressDto: CreateAdressDto) {
    return this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.customerAddress.count({
        where: { userId, deletedAt: null },
      });
      const shouldBeDefault = createAdressDto.isDefault ?? activeCount === 0;

      if (shouldBeDefault) {
        await tx.customerAddress.updateMany({
          where: {
            userId,
            isDefault: true,
            deletedAt: null,
          },
          data: {
            isDefault: false,
            updatedBy: userId,
          },
        });
      }

      const address = await tx.customerAddress.create({
        data: {
          userId,
          fullName: createAdressDto.fullName,
          phone: createAdressDto.phone,
          label: createAdressDto.label,
          line1: createAdressDto.line1,
          line2: createAdressDto.line2,
          city: createAdressDto.city,
          state: createAdressDto.state,
          country: createAdressDto.country,
          postalCode: createAdressDto.postalCode,
          landmark: createAdressDto.landmark,
          latitude: createAdressDto.latitude,
          longitude: createAdressDto.longitude,
          isActive: createAdressDto.isActive ?? true,
          isDefault: shouldBeDefault,
          createdBy: userId,
          updatedBy: userId,
        },
      });

      return {
        message: 'Address created successfully',
        address: this.toAddressResponse(address),
      };
    });
  }

  async findAll(userId: string) {
    const addresses = await this.prisma.customerAddress.findMany({
      where: {
        userId,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: addresses.map((address) => this.toAddressResponse(address)),
    };
  }

  async findOne(userId: string, id: string) {
    const address = await this.findOwnedAddressOrThrow(userId, id);
    return this.toAddressResponse(address);
  }

  async update(userId: string, id: string, updateAdressDto: UpdateAdressDto) {
    await this.findOwnedAddressOrThrow(userId, id);

    return this.prisma.$transaction(async (tx) => {
      if (updateAdressDto.isDefault === true) {
        await tx.customerAddress.updateMany({
          where: {
            userId,
            deletedAt: null,
            NOT: { id },
          },
          data: {
            isDefault: false,
            updatedBy: userId,
          },
        });
      }

      const address = await tx.customerAddress.update({
        where: { id },
        data: {
          fullName: updateAdressDto.fullName,
          phone: updateAdressDto.phone,
          label: updateAdressDto.label,
          line1: updateAdressDto.line1,
          line2: updateAdressDto.line2,
          city: updateAdressDto.city,
          state: updateAdressDto.state,
          country: updateAdressDto.country,
          postalCode: updateAdressDto.postalCode,
          landmark: updateAdressDto.landmark,
          latitude: updateAdressDto.latitude,
          longitude: updateAdressDto.longitude,
          isActive: updateAdressDto.isActive,
          isDefault: updateAdressDto.isDefault,
          updatedBy: userId,
        },
      });

      return {
        message: 'Address updated successfully',
        address: this.toAddressResponse(address),
      };
    });
  }

  async remove(userId: string, id: string) {
    const address = await this.findOwnedAddressOrThrow(userId, id);

    await this.prisma.customerAddress.update({
      where: { id },
      data: {
        isActive: false,
        isDefault: false,
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });

    if (address.isDefault) {
      const replacement = await this.prisma.customerAddress.findFirst({
        where: {
          userId,
          deletedAt: null,
          NOT: { id },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (replacement) {
        await this.prisma.customerAddress.update({
          where: { id: replacement.id },
          data: {
            isDefault: true,
            updatedBy: userId,
          },
        });
      }
    }

    return { message: 'Address deleted successfully', deleted: true };
  }

  private async findOwnedAddressOrThrow(userId: string, id: string) {
    const address = await this.prisma.customerAddress.findFirst({
      where: {
        id,
        userId,
        deletedAt: null,
      },
    });

    if (!address) {
      throw new NotFoundException({ message: 'Address not found', code: 'ADDRESS_NOT_FOUND' });
    }

    return address;
  }

  private toAddressResponse(address: Prisma.CustomerAddressGetPayload<object>) {
    return {
      id: address.id,
      userId: address.userId,
      fullName: address.fullName,
      phone: address.phone,
      label: address.label,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      country: address.country,
      postalCode: address.postalCode,
      landmark: address.landmark,
      latitude: address.latitude,
      longitude: address.longitude,
      isActive: address.isActive,
      isDefault: address.isDefault,
      createdBy: address.createdBy,
      updatedBy: address.updatedBy,
      deletedBy: address.deletedBy,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt,
      deletedAt: address.deletedAt,
    };
  }
}
